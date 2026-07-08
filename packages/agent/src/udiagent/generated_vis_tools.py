"""
Auto-generated visualization tool definitions.

Generated from: src/udiagent/data/skills/template_visualizations.json
Schema: data/data_domains/hubmap_data_schema.json
Tools: 52

DO NOT EDIT — regenerate with: python src/generate_tools.py
"""


# Schema metadata (entity URLs and relationships)
SCHEMA = {'entities': {'datasets': {'fields': {'ablation_distance_between_shots_x_units': {'cardinality': 1, 'type': 'nominal'},
                                      'ablation_distance_between_shots_x_value': {'cardinality': 1,
                                                                                  'type': 'quantitative'},
                                      'ablation_distance_between_shots_y_units': {'cardinality': 1, 'type': 'nominal'},
                                      'ablation_distance_between_shots_y_value': {'cardinality': 1,
                                                                                  'type': 'quantitative'},
                                      'ablation_frequency_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'ablation_frequency_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'acquisition_instrument_model': {'cardinality': 73, 'type': 'nominal'},
                                      'acquisition_instrument_vendor': {'cardinality': 29, 'type': 'nominal'},
                                      'amount_of_input_analyte_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'amount_of_input_analyte_value': {'cardinality': 6, 'type': 'quantitative'},
                                      'analysis_protocol_doi': {'cardinality': 17, 'type': 'nominal'},
                                      'analyte_class': {'cardinality': 12, 'type': 'nominal'},
                                      'anatomical_structure_id': {'cardinality': 1, 'type': 'nominal'},
                                      'anatomical_structure_label': {'cardinality': 1, 'type': 'nominal'},
                                      'antibody_reagent_kit': {'cardinality': 1, 'type': 'nominal'},
                                      'area_normalized_ion_dose_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'area_normalized_ion_dose_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'assay_category': {'cardinality': 4, 'type': 'nominal'},
                                      'assay_input_entity': {'cardinality': 4, 'type': 'nominal'},
                                      'assay_type': {'cardinality': 37, 'type': 'nominal'},
                                      'barcode_offset': {'cardinality': 6, 'type': 'nominal'},
                                      'barcode_read': {'cardinality': 3, 'type': 'nominal'},
                                      'barcode_size': {'cardinality': 4, 'type': 'nominal'},
                                      'bead_barcode_offset': {'cardinality': 1, 'type': 'nominal'},
                                      'bead_barcode_read': {'cardinality': 1, 'type': 'nominal'},
                                      'bead_barcode_size': {'cardinality': 1, 'type': 'nominal'},
                                      'bulk_atac_cell_isolation_protocols_io_doi': {'cardinality': 2,
                                                                                    'type': 'nominal'},
                                      'bulk_rna_isolation_protocols_io_doi': {'cardinality': 2, 'type': 'nominal'},
                                      'bulk_rna_isolation_quality_metric_value': {'cardinality': 32,
                                                                                  'type': 'quantitative'},
                                      'bulk_rna_yield_units_per_tissue_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'bulk_rna_yield_value': {'cardinality': 75, 'type': 'quantitative'},
                                      'bulk_transposition_input_number_nuclei': {'cardinality': 1,
                                                                                 'type': 'quantitative'},
                                      'capture_area_id': {'cardinality': 4, 'type': 'nominal'},
                                      'capture_batch_id': {'cardinality': 57, 'type': 'nominal'},
                                      'cell_barcode_offset': {'cardinality': 5, 'type': 'nominal'},
                                      'cell_barcode_read': {'cardinality': 18, 'type': 'nominal'},
                                      'cell_barcode_size': {'cardinality': 5, 'type': 'nominal'},
                                      'cell_boundary_marker_or_stain': {'cardinality': 4, 'type': 'nominal'},
                                      'created_by_user_displayname': {'cardinality': 22, 'type': 'nominal'},
                                      'created_by_user_email': {'cardinality': 24, 'type': 'nominal'},
                                      'created_timestamp': {'cardinality': 6322, 'type': 'quantitative'},
                                      'data_collection_mode': {'cardinality': 3, 'type': 'nominal'},
                                      'data_precision_bytes': {'cardinality': 2, 'type': 'quantitative'},
                                      'dataset_type': {'cardinality': 15, 'type': 'nominal'},
                                      'description': {'cardinality': 255, 'type': 'nominal'},
                                      'desi_solvent': {'cardinality': 3, 'type': 'nominal'},
                                      'desi_solvent_flow_rate': {'cardinality': 3, 'type': 'quantitative'},
                                      'desi_solvent_flow_rate_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'dms': {'cardinality': 3, 'type': 'nominal'},
                                      'dna_assay_input_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'dna_assay_input_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'donor.hubmap_id': {'cardinality': 432, 'type': 'nominal'},
                                      'dual_count_start': {'cardinality': 2, 'type': 'quantitative'},
                                      'end_datetime': {'cardinality': 14, 'type': 'nominal'},
                                      'execution_datetime': {'cardinality': 528, 'type': 'nominal'},
                                      'expected_cell_count': {'cardinality': 24, 'type': 'quantitative'},
                                      'expected_entity_capture_count': {'cardinality': 95, 'type': 'quantitative'},
                                      'gdna_fragmentation_quality_assurance': {'cardinality': 2, 'type': 'nominal'},
                                      'group_name': {'cardinality': 22, 'type': 'nominal'},
                                      'hubmap_id': {'cardinality': 6323, 'type': 'nominal'},
                                      'increment_z_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'increment_z_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'instrument_calibration_bead_kit': {'cardinality': 1, 'type': 'nominal'},
                                      'intended_tile_overlap_percentage': {'cardinality': 4, 'type': 'quantitative'},
                                      'ion_mobility': {'cardinality': 2, 'type': 'nominal'},
                                      'is_batch_staining_done': {'cardinality': 4, 'type': 'nominal'},
                                      'is_cell_activation_performed': {'cardinality': 1, 'type': 'nominal'},
                                      'is_custom_probes_used': {'cardinality': 1, 'type': 'nominal'},
                                      'is_erythrocyte_lysis_performed': {'cardinality': 1, 'type': 'nominal'},
                                      'is_fcr_blocking_applied': {'cardinality': 1, 'type': 'nominal'},
                                      'is_heparin_used': {'cardinality': 1, 'type': 'nominal'},
                                      'is_image_preprocessing_required': {'cardinality': 3, 'type': 'nominal'},
                                      'is_staining_automated': {'cardinality': 3, 'type': 'nominal'},
                                      'is_targeted': {'cardinality': 6, 'type': 'nominal'},
                                      'is_technical_replicate': {'cardinality': 3, 'type': 'nominal'},
                                      'labeling': {'cardinality': 7, 'type': 'nominal'},
                                      'last_modified_timestamp': {'cardinality': 6323, 'type': 'quantitative'},
                                      'lc_column_length_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'lc_column_length_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'lc_column_model': {'cardinality': 10, 'type': 'nominal'},
                                      'lc_column_vendor': {'cardinality': 8, 'type': 'nominal'},
                                      'lc_flow_rate_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'lc_flow_rate_value': {'cardinality': 6, 'type': 'quantitative'},
                                      'lc_gradient': {'cardinality': 8, 'type': 'nominal'},
                                      'lc_id_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'lc_id_value': {'cardinality': 3, 'type': 'quantitative'},
                                      'lc_inner_diameter_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'lc_inner_diameter_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'lc_instrument_model': {'cardinality': 11, 'type': 'nominal'},
                                      'lc_instrument_vendor': {'cardinality': 9, 'type': 'nominal'},
                                      'lc_length_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'lc_length_value': {'cardinality': 5, 'type': 'quantitative'},
                                      'lc_mobile_phase_a': {'cardinality': 9, 'type': 'nominal'},
                                      'lc_mobile_phase_b': {'cardinality': 10, 'type': 'nominal'},
                                      'lc_resin': {'cardinality': 9, 'type': 'nominal'},
                                      'lc_temp_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'lc_temp_value': {'cardinality': 6, 'type': 'quantitative'},
                                      'lc_temperature_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'lc_temperature_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'library_adapter_sequence': {'cardinality': 45, 'type': 'nominal'},
                                      'library_average_fragment_size': {'cardinality': 301, 'type': 'quantitative'},
                                      'library_concentration_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'library_concentration_value': {'cardinality': 476, 'type': 'quantitative'},
                                      'library_construction_method': {'cardinality': 1, 'type': 'nominal'},
                                      'library_construction_protocols_io_doi': {'cardinality': 21, 'type': 'nominal'},
                                      'library_creation_date': {'cardinality': 1, 'type': 'nominal'},
                                      'library_final_yield': {'cardinality': 63, 'type': 'quantitative'},
                                      'library_final_yield_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'library_final_yield_value': {'cardinality': 373, 'type': 'quantitative'},
                                      'library_input_amount_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'library_input_amount_value': {'cardinality': 281, 'type': 'quantitative'},
                                      'library_layout': {'cardinality': 3, 'type': 'nominal'},
                                      'library_output_amount_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'library_output_amount_value': {'cardinality': 441, 'type': 'quantitative'},
                                      'library_pcr_cycles': {'cardinality': 14, 'type': 'quantitative'},
                                      'library_pcr_cycles_for_sample_index': {'cardinality': 11,
                                                                              'type': 'quantitative'},
                                      'library_preparation_kit': {'cardinality': 6, 'type': 'nominal'},
                                      'mapped_area_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'mapped_area_value': {'cardinality': 12, 'type': 'quantitative'},
                                      'mapped_consortium': {'cardinality': 2, 'type': 'nominal'},
                                      'mass_analysis_polarity': {'cardinality': 2, 'type': 'nominal'},
                                      'mass_resolving_power': {'cardinality': 30, 'type': 'quantitative'},
                                      'mass_to_charge_range_high_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'mass_to_charge_range_low_value': {'cardinality': 4, 'type': 'quantitative'},
                                      'mass_to_charge_resolving_power': {'cardinality': 3, 'type': 'quantitative'},
                                      'matrix_deposition_method': {'cardinality': 1, 'type': 'nominal'},
                                      'max_x_width_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'max_x_width_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'max_y_height_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'max_y_height_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'metadata_schema_id': {'cardinality': 16, 'type': 'nominal'},
                                      'ms_ionization_technique': {'cardinality': 3, 'type': 'nominal'},
                                      'ms_scan_mode': {'cardinality': 6, 'type': 'nominal'},
                                      'ms_source': {'cardinality': 6, 'type': 'nominal'},
                                      'mz_range_high_value': {'cardinality': 8, 'type': 'quantitative'},
                                      'mz_range_low_value': {'cardinality': 11, 'type': 'quantitative'},
                                      'mz_resolving_power': {'cardinality': 6, 'type': 'quantitative'},
                                      'nuclear_marker_or_stain': {'cardinality': 1, 'type': 'nominal'},
                                      'number_of_antibodies': {'cardinality': 17, 'type': 'quantitative'},
                                      'number_of_barcode_probes': {'cardinality': 2, 'type': 'quantitative'},
                                      'number_of_barcode_regions_per_barcode_probe': {'cardinality': 2,
                                                                                      'type': 'quantitative'},
                                      'number_of_biomarker_imaging_rounds': {'cardinality': 9, 'type': 'quantitative'},
                                      'number_of_channels': {'cardinality': 6, 'type': 'quantitative'},
                                      'number_of_cycles': {'cardinality': 11, 'type': 'quantitative'},
                                      'number_of_imaging_rounds': {'cardinality': 2, 'type': 'quantitative'},
                                      'number_of_input_cells_or_nuclei': {'cardinality': 107, 'type': 'quantitative'},
                                      'number_of_iterations_of_cdna_amplification': {'cardinality': 11,
                                                                                     'type': 'quantitative'},
                                      'number_of_mass_channels': {'cardinality': 1, 'type': 'quantitative'},
                                      'number_of_panel_targets': {'cardinality': 1, 'type': 'quantitative'},
                                      'number_of_pcr_cycles_for_indexing': {'cardinality': 14, 'type': 'quantitative'},
                                      'number_of_pre_amplification_pcr_cycles': {'cardinality': 1,
                                                                                 'type': 'quantitative'},
                                      'number_of_pseudocolors_per_channel': {'cardinality': 1, 'type': 'quantitative'},
                                      'number_of_readout_probes_per_channel': {'cardinality': 1,
                                                                               'type': 'quantitative'},
                                      'number_of_sections': {'cardinality': 3, 'type': 'quantitative'},
                                      'number_of_spots': {'cardinality': 1, 'type': 'quantitative'},
                                      'number_of_total_imaging_rounds': {'cardinality': 9, 'type': 'quantitative'},
                                      'oligo_probe_panel': {'cardinality': 1, 'type': 'nominal'},
                                      'operator': {'cardinality': 48, 'type': 'nominal'},
                                      'operator_email': {'cardinality': 46, 'type': 'nominal'},
                                      'origin_samples_unique_mapped_organs': {'cardinality': 30, 'type': 'nominal'},
                                      'overall_protocols_io_doi': {'cardinality': 16, 'type': 'nominal'},
                                      'permeabilization_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'permeabilization_time_value': {'cardinality': 2, 'type': 'quantitative'},
                                      'pi': {'cardinality': 25, 'type': 'nominal'},
                                      'pi_email': {'cardinality': 22, 'type': 'nominal'},
                                      'pixel_dwell_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'pixel_dwell_time_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'pixel_size_x_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'pixel_size_x_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'pixel_size_y_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'pixel_size_y_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'polarity': {'cardinality': 8, 'type': 'nominal'},
                                      'preparation_instrument_kit': {'cardinality': 2, 'type': 'nominal'},
                                      'preparation_instrument_model': {'cardinality': 14, 'type': 'nominal'},
                                      'preparation_instrument_vendor': {'cardinality': 11, 'type': 'nominal'},
                                      'preparation_maldi_matrix': {'cardinality': 2, 'type': 'nominal'},
                                      'preparation_matrix': {'cardinality': 2, 'type': 'nominal'},
                                      'preparation_protocol_doi': {'cardinality': 55, 'type': 'nominal'},
                                      'preparation_type': {'cardinality': 3, 'type': 'nominal'},
                                      'primary_ion': {'cardinality': 1, 'type': 'nominal'},
                                      'primary_ion_current_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'primary_ion_current_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'probe_hybridization_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'probe_hybridization_time_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'processing_protocols_io_doi': {'cardinality': 10, 'type': 'nominal'},
                                      'processing_search': {'cardinality': 8, 'type': 'nominal'},
                                      'proteinasek_concentration': {'cardinality': 1, 'type': 'quantitative'},
                                      'proteinasek_incubation_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'proteinasek_incubation_time_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'protocols_io_doi': {'cardinality': 50, 'type': 'nominal'},
                                      'published_timestamp': {'cardinality': 6304, 'type': 'quantitative'},
                                      'puck_id': {'cardinality': 42, 'type': 'nominal'},
                                      'range_z_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'range_z_value': {'cardinality': 3, 'type': 'quantitative'},
                                      'reagent_prep_protocols_io_doi': {'cardinality': 7, 'type': 'nominal'},
                                      'resolution_x_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'resolution_x_value': {'cardinality': 21, 'type': 'quantitative'},
                                      'resolution_y_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'resolution_y_value': {'cardinality': 21, 'type': 'quantitative'},
                                      'resolution_z_unit': {'cardinality': 2, 'type': 'nominal'},
                                      'resolution_z_value': {'cardinality': 6, 'type': 'quantitative'},
                                      'rnaseq_assay_input': {'cardinality': 130, 'type': 'quantitative'},
                                      'rnaseq_assay_input_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'rnaseq_assay_input_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'rnaseq_assay_method': {'cardinality': 24, 'type': 'nominal'},
                                      'roi_description': {'cardinality': 17, 'type': 'nominal'},
                                      'roi_id': {'cardinality': 6, 'type': 'quantitative'},
                                      'roi_label': {'cardinality': 12, 'type': 'nominal'},
                                      'sample_indexing_kit': {'cardinality': 5, 'type': 'nominal'},
                                      'sample_indexing_set': {'cardinality': 232, 'type': 'nominal'},
                                      'sample_quality_metric': {'cardinality': 2, 'type': 'nominal'},
                                      'sc_isolation_cell_number': {'cardinality': 249, 'type': 'quantitative'},
                                      'sc_isolation_enrichment': {'cardinality': 3, 'type': 'nominal'},
                                      'sc_isolation_entity': {'cardinality': 5, 'type': 'nominal'},
                                      'sc_isolation_protocols_io_doi': {'cardinality': 19, 'type': 'nominal'},
                                      'sc_isolation_quality_metric': {'cardinality': 4, 'type': 'nominal'},
                                      'sc_isolation_tissue_dissociation': {'cardinality': 9, 'type': 'nominal'},
                                      'scan_direction': {'cardinality': 2, 'type': 'nominal'},
                                      'section_prep_protocols_io_doi': {'cardinality': 22, 'type': 'nominal'},
                                      'segment_data_format': {'cardinality': 2, 'type': 'nominal'},
                                      'sequencing_batch_id': {'cardinality': 39, 'type': 'nominal'},
                                      'sequencing_phix_percent': {'cardinality': 6, 'type': 'quantitative'},
                                      'sequencing_read_format': {'cardinality': 33, 'type': 'nominal'},
                                      'sequencing_read_percent_q30': {'cardinality': 461, 'type': 'quantitative'},
                                      'sequencing_reagent_kit': {'cardinality': 28, 'type': 'nominal'},
                                      'signal_type': {'cardinality': 2, 'type': 'nominal'},
                                      'source_project': {'cardinality': 1, 'type': 'nominal'},
                                      'source_storage_duration_unit': {'cardinality': 5, 'type': 'nominal'},
                                      'source_storage_duration_value': {'cardinality': 281, 'type': 'quantitative'},
                                      'spatial_sampling_type': {'cardinality': 1, 'type': 'nominal'},
                                      'spatial_target': {'cardinality': 2, 'type': 'nominal'},
                                      'spatial_type': {'cardinality': 1, 'type': 'nominal'},
                                      'spot_size_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'spot_size_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'spot_spacing_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'spot_spacing_value': {'cardinality': 1, 'type': 'quantitative'},
                                      'stain': {'cardinality': 2, 'type': 'nominal'},
                                      'stain_name': {'cardinality': 3, 'type': 'nominal'},
                                      'stain_technique': {'cardinality': 4, 'type': 'nominal'},
                                      'start_datetime': {'cardinality': 14, 'type': 'nominal'},
                                      'status': {'cardinality': 1, 'type': 'nominal'},
                                      'step_z_value': {'cardinality': 3, 'type': 'quantitative'},
                                      'target_retrieval_incubation_temperature': {'cardinality': 1,
                                                                                  'type': 'quantitative'},
                                      'target_retrieval_incubation_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'target_retrieval_incubation_time_value': {'cardinality': 1,
                                                                                 'type': 'quantitative'},
                                      'tile_configuration': {'cardinality': 2, 'type': 'nominal'},
                                      'tiled_image_columns': {'cardinality': 7, 'type': 'quantitative'},
                                      'tiled_image_count': {'cardinality': 10, 'type': 'quantitative'},
                                      'time_since_acquisition_instrument_calibration_unit': {'cardinality': 2,
                                                                                             'type': 'nominal'},
                                      'time_since_acquisition_instrument_calibration_value': {'cardinality': 20,
                                                                                              'type': 'quantitative'},
                                      'total_run_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                      'total_run_time_value': {'cardinality': 29, 'type': 'quantitative'},
                                      'transposition_input': {'cardinality': 67, 'type': 'quantitative'},
                                      'transposition_kit_number': {'cardinality': 7, 'type': 'nominal'},
                                      'transposition_method': {'cardinality': 6, 'type': 'nominal'},
                                      'transposition_reagent_kit': {'cardinality': 2, 'type': 'nominal'},
                                      'transposition_transposase_source': {'cardinality': 5, 'type': 'nominal'},
                                      'umi_offset': {'cardinality': 4, 'type': 'nominal'},
                                      'umi_read': {'cardinality': 4, 'type': 'nominal'},
                                      'umi_size': {'cardinality': 3, 'type': 'nominal'},
                                      'uuid': {'cardinality': 6323, 'type': 'nominal'},
                                      'viability_reagent_kit': {'cardinality': 1, 'type': 'nominal'}},
                           'url': 'https://portal.hubmapconsortium.org/metadata/v0/udi/datasets.tsv'},
              'donors': {'fields': {'abo_blood_group_system': {'cardinality': 6, 'type': 'nominal'},
                                    'age_unit': {'cardinality': 2, 'type': 'nominal'},
                                    'age_value': {'cardinality': 137, 'type': 'quantitative'},
                                    'apolipoprotein_e_phenotype': {'cardinality': 1, 'type': 'nominal'},
                                    'body_mass_index_unit': {'cardinality': 1, 'type': 'nominal'},
                                    'body_mass_index_value': {'cardinality': 176, 'type': 'quantitative'},
                                    'cause_of_death': {'cardinality': 8, 'type': 'nominal'},
                                    'created_by_user_displayname': {'cardinality': 25, 'type': 'nominal'},
                                    'created_by_user_email': {'cardinality': 26, 'type': 'nominal'},
                                    'created_timestamp': {'cardinality': 432, 'type': 'quantitative'},
                                    'death_event': {'cardinality': 5, 'type': 'nominal'},
                                    'egfr_ckd_epi_2021__unit': {'cardinality': 1, 'type': 'nominal'},
                                    'egfr_ckd_epi_2021__value': {'cardinality': 2, 'type': 'quantitative'},
                                    'ethnicity': {'cardinality': 2, 'type': 'nominal'},
                                    'fitzpatrick_classification_scale': {'cardinality': 4, 'type': 'nominal'},
                                    'gestational_age_unit': {'cardinality': 1, 'type': 'nominal'},
                                    'gestational_age_value': {'cardinality': 7, 'type': 'quantitative'},
                                    'group_name': {'cardinality': 18, 'type': 'nominal'},
                                    'height_unit': {'cardinality': 1, 'type': 'nominal'},
                                    'height_value': {'cardinality': 66, 'type': 'quantitative'},
                                    'hubmap_id': {'cardinality': 432, 'type': 'nominal'},
                                    'kidney_donor_profile_index_unit': {'cardinality': 1, 'type': 'nominal'},
                                    'kidney_donor_profile_index_value': {'cardinality': 25, 'type': 'quantitative'},
                                    'last_modified_timestamp': {'cardinality': 432, 'type': 'quantitative'},
                                    'mapped_consortium': {'cardinality': 2, 'type': 'nominal'},
                                    'mechanism_of_injury': {'cardinality': 12, 'type': 'nominal'},
                                    'medical_history': {'cardinality': 85, 'type': 'nominal'},
                                    'other_anatomic_concept': {'cardinality': 1, 'type': 'nominal'},
                                    'pathology_note': {'cardinality': 1, 'type': 'nominal'},
                                    'race': {'cardinality': 7, 'type': 'nominal'},
                                    'rh_blood_group': {'cardinality': 2, 'type': 'nominal'},
                                    'serum_creatinine_unit': {'cardinality': 1, 'type': 'nominal'},
                                    'serum_creatinine_value': {'cardinality': 2, 'type': 'quantitative'},
                                    'sex': {'cardinality': 3, 'type': 'nominal'},
                                    'social_history': {'cardinality': 24, 'type': 'nominal'},
                                    'uuid': {'cardinality': 432, 'type': 'nominal'},
                                    'weight_unit': {'cardinality': 1, 'type': 'nominal'},
                                    'weight_value': {'cardinality': 173, 'type': 'quantitative'}},
                         'url': 'https://portal.hubmapconsortium.org/metadata/v0/udi/donors.tsv'},
              'samples': {'fields': {'PPID': {'cardinality': 2, 'type': 'quantitative'},
                                     'Preservation_condition': {'cardinality': 2, 'type': 'nominal'},
                                     'Preservation_media': {'cardinality': 2, 'type': 'nominal'},
                                     'area_unit': {'cardinality': 1, 'type': 'nominal'},
                                     'area_value': {'cardinality': 80, 'type': 'quantitative'},
                                     'cold_ischemia_time_unit': {'cardinality': 1, 'type': 'nominal'},
                                     'cold_ischemia_time_value': {'cardinality': 79, 'type': 'quantitative'},
                                     'created_by_user_displayname': {'cardinality': 37, 'type': 'nominal'},
                                     'created_by_user_email': {'cardinality': 40, 'type': 'nominal'},
                                     'created_timestamp': {'cardinality': 3922, 'type': 'quantitative'},
                                     'donor.hubmap_id': {'cardinality': 432, 'type': 'nominal'},
                                     'entity_type': {'cardinality': 1, 'type': 'nominal'},
                                     'group_name': {'cardinality': 19, 'type': 'nominal'},
                                     'health_status': {'cardinality': 4, 'type': 'nominal'},
                                     'histological_report': {'cardinality': 21, 'type': 'nominal'},
                                     'hubmap_id': {'cardinality': 4489, 'type': 'nominal'},
                                     'is_rehydrated': {'cardinality': 1, 'type': 'nominal'},
                                     'is_suspension_enriched': {'cardinality': 1, 'type': 'nominal'},
                                     'last_modified_timestamp': {'cardinality': 3980, 'type': 'quantitative'},
                                     'mapped_consortium': {'cardinality': 2, 'type': 'nominal'},
                                     'metadata_schema_id': {'cardinality': 3, 'type': 'nominal'},
                                     'notes': {'cardinality': 84, 'type': 'nominal'},
                                     'organ_condition': {'cardinality': 2, 'type': 'nominal'},
                                     'origin_samples_unique_mapped_organs': {'cardinality': 29, 'type': 'nominal'},
                                     'pathologist_report': {'cardinality': 14, 'type': 'nominal'},
                                     'perfusion_solution': {'cardinality': 6, 'type': 'nominal'},
                                     'preparation_condition': {'cardinality': 10, 'type': 'nominal'},
                                     'preparation_medium': {'cardinality': 7, 'type': 'nominal'},
                                     'preparation_protocol_doi': {'cardinality': 23, 'type': 'nominal'},
                                     'procedure_date': {'cardinality': 67, 'type': 'nominal'},
                                     'processing_time_unit': {'cardinality': 2, 'type': 'nominal'},
                                     'processing_time_value': {'cardinality': 6, 'type': 'quantitative'},
                                     'quality_criteria': {'cardinality': 2, 'type': 'nominal'},
                                     'sample_category': {'cardinality': 4, 'type': 'nominal'},
                                     'sample_id': {'cardinality': 1144, 'type': 'nominal'},
                                     'section_index_number': {'cardinality': 67, 'type': 'quantitative'},
                                     'source_id': {'cardinality': 420, 'type': 'nominal'},
                                     'source_storage_duration_unit': {'cardinality': 4, 'type': 'nominal'},
                                     'source_storage_duration_value': {'cardinality': 226, 'type': 'quantitative'},
                                     'specimen_preservation_temperature': {'cardinality': 4, 'type': 'nominal'},
                                     'specimen_quality_criteria': {'cardinality': 3, 'type': 'nominal'},
                                     'specimen_tumor_distance_unit': {'cardinality': 1, 'type': 'nominal'},
                                     'specimen_tumor_distance_value': {'cardinality': 11, 'type': 'quantitative'},
                                     'storage_medium': {'cardinality': 5, 'type': 'nominal'},
                                     'storage_method': {'cardinality': 7, 'type': 'nominal'},
                                     'suspension_entity_count': {'cardinality': 83, 'type': 'quantitative'},
                                     'suspension_entity_type': {'cardinality': 2, 'type': 'nominal'},
                                     'thickness_unit': {'cardinality': 1, 'type': 'nominal'},
                                     'thickness_value': {'cardinality': 2, 'type': 'quantitative'},
                                     'tissue_weight_unit': {'cardinality': 1, 'type': 'nominal'},
                                     'tissue_weight_value': {'cardinality': 95, 'type': 'quantitative'},
                                     'uuid': {'cardinality': 4489, 'type': 'nominal'},
                                     'vital_state': {'cardinality': 2, 'type': 'nominal'},
                                     'warm_ischemia_time_unit': {'cardinality': 2, 'type': 'nominal'},
                                     'warm_ischemia_time_value': {'cardinality': 11, 'type': 'nominal'}},
                          'url': 'https://portal.hubmapconsortium.org/metadata/v0/udi/samples.tsv'}},
 'relationships': [{'from_cardinality': 'many',
                    'from_entity': 'samples',
                    'from_field': 'donor.hubmap_id',
                    'to_cardinality': 'one',
                    'to_entity': 'donors',
                    'to_field': 'hubmap_id'},
                   {'from_cardinality': 'many',
                    'from_entity': 'datasets',
                    'from_field': 'donor.hubmap_id',
                    'to_cardinality': 'one',
                    'to_entity': 'donors',
                    'to_field': 'hubmap_id'},
                   {'from_cardinality': 'many',
                    'from_entity': 'datasets',
                    'from_field': 'donor.hubmap_id',
                    'to_cardinality': 'many',
                    'to_entity': 'samples',
                    'to_field': 'donor.hubmap_id'}]}


# Spec template strings (indexed by position)
TEMPLATES = ['{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"<E> count": '
 '{"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F>", "type": '
 '"nominal"}, {"encoding": "y", "field": "<E> count", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"<E> count": '
 '{"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<E> count", "type": '
 '"quantitative"}, {"encoding": "y", "field": "<F>", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E2.F>"}, {"rollup": {"<E1> count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": '
 '[{"encoding": "x", "field": "<E2.F>", "type": "nominal"}, {"encoding": "y", "field": "<E1> count", "type": '
 '"quantitative"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E2.F>"}, {"rollup": {"<E1> count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": '
 '[{"encoding": "x", "field": "<E1> count", "type": "quantitative"}, {"encoding": "y", "field": "<E2.F>", "type": '
 '"nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": ["<E2.F2>", "<E1.F1>"]}, {"rollup": {"count <E1>": {"op": "count"}}}], "representation": {"mark": "bar", '
 '"mapping": [{"encoding": "y", "field": "count <E1>", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<E2.F2>", "type": "nominal"}, {"encoding": "x", "field": "<E1.F1>", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": ["<E2.F2>", "<E1.F1>"]}, {"rollup": {"count <E1>": {"op": "count"}}}], "representation": {"mark": "bar", '
 '"mapping": [{"encoding": "x", "field": "count <E1>", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<E1.F1>", "type": "nominal"}, {"encoding": "y", "field": "<E2.F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F2>", "<F1>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "y", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "color", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "color", "field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "y", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "xOffset", "field": "<F1>", "type": "nominal"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "yOffset", "field": "<F1>", "type": "nominal"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>", "out": "groupCounts"}, '
 '{"rollup": {"<F2>_count": {"op": "count"}}}, {"groupby": ["<F1>", "<F2>"], "in": "<E>"}, {"rollup": '
 '{"<F1>_and_<F2>_count": {"op": "count"}}}, {"join": {"on": "<F2>"}, "in": ["<E>", "groupCounts"], "out": '
 '"datasets"}, {"derive": {"proportion": "d[\'<F1>_and_<F2>_count\'] / d[\'<F2>_count\']"}}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "y", "field": "proportion", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>", "out": "groupCounts"}, '
 '{"rollup": {"<F2>_count": {"op": "count"}}}, {"groupby": ["<F1>", "<F2>"], "in": "<E>"}, {"rollup": '
 '{"<F1>_and_<F2>_count": {"op": "count"}}}, {"join": {"on": "<F2>"}, "in": ["<E>", "groupCounts"], "out": '
 '"datasets"}, {"derive": {"proportion": "d[\'<F1>_and_<F2>_count\'] / d[\'<F2>_count\']"}}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "x", "field": "proportion", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"minimum <F1>": '
 '{"op": "min", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "minimum '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"minimum <F1>": '
 '{"op": "min", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "minimum <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"maximum <F1>": '
 '{"op": "max", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "maximum '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"maximum <F1>": '
 '{"op": "max", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "maximum <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"average <F1>": '
 '{"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"average <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"average <F1>": '
 '{"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "average <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"median <F1>": '
 '{"op": "median", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"median <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"median <F1>": '
 '{"op": "median", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "median <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"total <F1>": '
 '{"op": "sum", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "total '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"total <F1>": '
 '{"op": "sum", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "total <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F1>", '
 '"type": "nominal"}, {"encoding": "y", "field": "count", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count", '
 '"type": "quantitative"}, {"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "color", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"proportion": '
 '{"op": "frequency"}}}], "representation": {"mark": "arc", "mapping": [{"encoding": "theta", "field": "proportion", '
 '"type": "quantitative", "domainWhenFiltered": "filtered"}, {"encoding": "color", "field": "<F>", "type": '
 '"nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"proportion": '
 '{"op": "frequency"}}}], "representation": {"mark": "arc", "mapping": [{"encoding": "theta", "field": "proportion", '
 '"type": "quantitative", "domainWhenFiltered": "filtered"}, {"encoding": "color", "field": "<F>", "type": "nominal"}, '
 '{"encoding": "radius", "value": 60}, {"encoding": "radius2", "value": 80}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"rollup": {"<E> Records": {"op": "count"}}}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}]}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"<E1> count": {"op": "count"}}}, {"orderby": {"field": "<E1> count", '
 '"order": "desc"}}, {"derive": {"rank": "rank()"}}, {"derive": {"most frequent": "d.rank == 1 ? \'yes\' : \'no\'"}}], '
 '"representation": [{"mark": "row", "mapping": [{"encoding": "x", "field": "<E1> count", "mark": "bar", "type": '
 '"quantitative", "domain": {"min": 0}}, {"encoding": "color", "column": "<E1> count", "mark": "bar", "field": "most '
 'frequent", "type": "nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}]}, {"mark": "row", '
 '"mapping": {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "desc"}}, {"derive": {"largest": "rank() == 1 ? \'largest\' : \'not\'"}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "x", "field": "<F>", "mark": "bar", "type": '
 '"quantitative"}, {"encoding": "color", "column": "<F>", "mark": "bar", "field": "largest", "type": "nominal", '
 '"domain": ["largest", "not"], "range": ["#FFA500", "c6cfd8"]}, {"encoding": "text", "field": "*", "mark": "text", '
 '"type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Largest <E1.F>": {"op": "max", "field": "<E1.F>"}}}, {"filter": '
 '"d[\'Largest <E1.F>\'] != null"}, {"orderby": {"field": "Largest <E1.F>", "order": "desc"}}, {"derive": {"rank": '
 '"rank()"}}, {"derive": {"largest": "d.rank == 1 ? \'yes\' : \'no\'"}}], "representation": {"mark": "row", "mapping": '
 '[{"encoding": "x", "field": "Largest <E1.F>", "mark": "bar", "type": "quantitative"}, {"encoding": "color", '
 '"column": "Largest <E1.F>", "mark": "bar", "field": "largest", "type": "nominal", "domain": ["yes", "no"], "range": '
 '["#FFA500", "#c6cfd8"]}, {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "asc"}}, {"derive": {"smallest": "rank() == 1 ? \'smallest\' : \'not\'"}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "color", "column": "<F>", "mark": "rect", "orderby": '
 '"<F>", "field": "smallest", "type": "nominal", "domain": ["smallest", "not"], "range": ["#ffdb9a", "white"]}, '
 '{"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Smallest <E1.F>": {"op": "min", "field": "<E1.F>"}}}, {"filter": '
 '"d[\'Smallest <E1.F>\'] != null"}, {"orderby": {"field": "Smallest <E1.F>", "order": "asc"}}, {"derive": {"rank": '
 '"rank()"}}, {"derive": {"smallest": "d.rank == 1 ? \'yes\' : \'no\'"}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "color", "column": "Smallest <E1.F>", "mark": "bar", "orderby": "Smallest <E1.F>", "field": '
 '"smallest", "type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", "white"]}, {"encoding": "text", '
 '"field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "asc"}}], "representation": {"mark": "row", "mapping": [{"encoding": "x", "column": "<F>", '
 '"mark": "bar", "field": "<F>", "type": "quantitative", "range": {"min": 0.2, "max": 1}}, {"encoding": "text", '
 '"field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"rollup": '
 '{"<F> min": {"op": "min", "field": "<F>"}, "<F> max": {"op": "max", "field": "<F>"}}}], "representation": {"mark": '
 '"row", "mapping": [{"encoding": "text", "field": "<F> min", "mark": "text", "type": "nominal"}, {"encoding": "text", '
 '"field": "<F> max", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"groupby": '
 '"<F>"}, {"rollup": {"count": {"op": "count"}}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", '
 '"field": "<F>", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "count", "mark": "bar", "type": '
 '"quantitative", "range": {"min": 0.1, "max": 1}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F1>\'] != null"}, {"groupby": '
 '"<F2>"}, {"rollup": {"<F1> min": {"op": "min", "field": "<F1>"}, "<F1> max": {"op": "max", "field": "<F1>"}}}, '
 '{"derive": {"range": "d[\'<F1> max\'] - d[\'<F1> min\']"}}, {"orderby": {"field": "range", "order": "desc"}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "text", "field": "<F2>", "mark": "text", "type": '
 '"nominal"}, {"encoding": "text", "field": "<F1> min", "mark": "text", "type": "nominal"}, {"encoding": "x", '
 '"column": "range", "mark": "bar", "field": "<F1> min", "type": "quantitative", "domain": {"numberFields": ["<F1> '
 'min", "<F1> max"]}}, {"encoding": "x2", "column": "range", "mark": "bar", "field": "<F1> max", "type": '
 '"quantitative", "domain": {"numberFields": ["<F1> min", "<F1> max"]}}, {"encoding": "text", "field": "<F1> max", '
 '"mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\']"}, {"groupby": "<F>"}, '
 '{"rollup": {"count": {"op": "count"}}}, {"orderby": {"field": "count", "order": "desc"}}, {"derive": {"rank": '
 '"rank()"}}, {"derive": {"most frequent": "d.rank == 1 ? \'yes\' : \'no\'"}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "color", "column": "<F>", "mark": "bar", "orderby": "<F>", "field": "most frequent", '
 '"type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", "white"]}, {"encoding": "text", "field": "<F>", '
 '"mark": "text", "type": "nominal"}, {"encoding": "x", "field": "count", "mark": "bar", "type": "quantitative", '
 '"domain": {"min": 0}}, {"encoding": "color", "column": "count", "mark": "bar", "field": "most frequent", "type": '
 '"nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "asc"}}, {"derive": {"total": "count()"}}, {"derive": {"percentile": {"rolling": '
 '{"expression": "count() / d.total"}}}}], "representation": {"mark": "line", "mapping": [{"encoding": "x", "field": '
 '"<F>", "type": "quantitative"}, {"encoding": "y", "field": "percentile", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F1>\'] != null"}, {"orderby": '
 '{"field": "<F1>", "order": "asc"}}, {"groupby": "<F2>"}, {"derive": {"total": "count()"}}, {"derive": {"percentile": '
 '{"rolling": {"expression": "count() / d.total"}}}}], "representation": {"mark": "line", "mapping": [{"encoding": '
 '"x", "field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "percentile", "type": "quantitative"}, '
 '{"encoding": "color", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F2>", "<F1>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}, {"derive": {"udi_internal_percentile": "d[\'count <E>\'] / max(d[\'count '
 '<E>\'])"}}, {"derive": {"udi_internal_text_color_threshold": "d.udi_internal_percentile > .5 ? \'large\' : '
 '\'small\'"}}], "representation": [{"mark": "rect", "mapping": [{"encoding": "color", "field": "count <E>", "type": '
 '"quantitative"}, {"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": '
 '"nominal"}]}, {"mark": "text", "mapping": [{"encoding": "text", "field": "count <E>", "type": "quantitative"}, '
 '{"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}, '
 '{"encoding": "color", "field": "udi_internal_text_color_threshold", "type": "nominal", "domain": ["large", "small"], '
 '"range": ["white", "black"], "omitLegend": true}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F3>", "<F2>"]}, {"rollup": '
 '{"average <F1>": {"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "rect", "mapping": [{"encoding": '
 '"color", "field": "average <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}, '
 '{"encoding": "x", "field": "<F3>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "quantitative"}, {"encoding": '
 '"color", "field": "<F3>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"binby": '
 '{"field": "<F>", "output": {"bin_start": "start", "bin_end": "end"}}}, {"rollup": {"count": {"op": "count"}}}], '
 '"representation": {"mark": "rect", "mapping": [{"encoding": "x", "field": "start", "type": "quantitative", "title": '
 '"<F>"}, {"encoding": "x2", "field": "end", "type": "quantitative"}, {"encoding": "y", "field": "count", "type": '
 '"quantitative", "domainWhenFiltered": "filtered"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"kde": '
 '{"field": "<F>", "output": {"sample": "<F>", "density": "density"}}}], "representation": {"mark": "area", "mapping": '
 '[{"encoding": "x", "field": "<F>", "type": "quantitative"}, {"encoding": "y", "field": "density", "type": '
 '"quantitative", "domainWhenFiltered": "filtered"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": {"encoding": "x", '
 '"field": "<F>", "type": "quantitative"}}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F1>\'] != null"}, {"groupby": '
 '"<F2>"}, {"kde": {"field": "<F1>", "output": {"sample": "<F1>", "density": "density"}}}], "representation": '
 '[{"mark": "area", "mapping": [{"encoding": "x", "field": "<F1>", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<F2>", "type": "nominal"}, {"encoding": "y", "field": "density", "type": "quantitative", '
 '"domainWhenFiltered": "filtered"}, {"encoding": "opacity", "value": 0.25}]}, {"mark": "line", "mapping": '
 '[{"encoding": "x", "field": "<F1>", "type": "quantitative"}, {"encoding": "color", "field": "<F2>", "type": '
 '"nominal"}, {"encoding": "y", "field": "density", "type": "quantitative", "domainWhenFiltered": "filtered"}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}, {"encoding": '
 '"color", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"derive": {"<E> Count": "count()"}}, {"filter": '
 '"d[\'<F>\'] != null"}, {"rollup": {"Valid <F> Count": {"op": "count"}, "<E> Count": {"op": "median", "field": "<E> '
 'Count"}}}, {"derive": {"Valid <F> %": "d[\'Valid <F> Count\'] / d[\'<E> Count\']"}}], "representation": {"mark": '
 '"row", "mapping": [{"encoding": "text", "field": "Valid <F> Count", "mark": "text", "type": "nominal"}, {"encoding": '
 '"text", "field": "<E> Count", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "Valid <F> %", "mark": '
 '"bar", "type": "quantitative", "domain": {"min": 0, "max": 1}}, {"encoding": "y", "field": "Valid <F> %", "mark": '
 '"line", "type": "quantitative", "range": {"min": 0.5, "max": 0.5}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"derive": {"<E> Count": "count()"}}, {"filter": '
 '"d[\'<F>\'] != null"}, {"rollup": {"Valid <F> Count": {"op": "count"}, "<E> Count": {"op": "median", "field": "<E> '
 'Count"}}}, {"derive": {"Null <F> Count": "d[\'<E> Count\'] - d[\'Valid <F> Count\']", "Null <F> %": "1 - d[\'Valid '
 '<F> Count\'] / d[\'<E> Count\']"}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": '
 '"Null <F> Count", "mark": "text", "type": "nominal"}, {"encoding": "text", "field": "<E> Count", "mark": "text", '
 '"type": "nominal"}, {"encoding": "x", "field": "Null <F> %", "mark": "bar", "type": "quantitative", "domain": '
 '{"min": 0, "max": 1}}, {"encoding": "y", "field": "Null <F> %", "mark": "line", "type": "quantitative", "range": '
 '{"min": 0.5, "max": 0.5}}]}}']


# OpenAI function-calling tool definitions
TOOL_DEFS = [{'function': {'description': '[barchart] Counts entities grouped by a nominal field, displayed as a vertical bar '
                              'chart. Design: Vertical orientation chosen because category count is small (<=4), '
                              'keeping x-axis labels readable. Tasks: Compare counts across categories; identify the '
                              'most or least common category; assess the range of counts. Query patterns: How many <E> '
                              'are there, grouped by <F:n>?; Make a bar chart of <E> <F:n>.',
               'name': 'vis_000_barchart_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Counts entities grouped by a nominal field, displayed as a horizontal bar '
                              'chart. Design: Horizontal orientation chosen because category count is high (>4), '
                              'allowing longer labels on the y-axis. Tasks: Compare counts across categories; identify '
                              'the most or least common category; assess the range of counts. Query patterns: How many '
                              '<E> are there, grouped by <F:n>?; Make a bar chart of <E> <F:n>.',
               'name': 'vis_001_barchart_count_horiz_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes y-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Joins two entities and counts records grouped by a field from the related '
                              'entity, displayed as a vertical bar chart. Design: Cross-entity join groups by a field '
                              'not native to the counted entity. Vertical orientation for small category counts (<=4). '
                              'Tasks: Compare counts across categories from a related entity; discover cross-entity '
                              'frequency patterns. Query patterns: How many <E1> are there, grouped by <E2.F:n>?',
               'name': 'vis_002_barchart_join_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes x-axis.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Joins two entities and counts records grouped by a field from the related '
                              'entity, displayed as a horizontal bar chart. Design: Cross-entity join with horizontal '
                              'orientation for higher category counts (>4). Tasks: Compare counts across categories '
                              'from a related entity; discover cross-entity frequency patterns. Query patterns: How '
                              'many <E1> are there, grouped by <E2.F:n>?',
               'name': 'vis_003_barchart_join_count_horiz_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes y-axis.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Joins two entities and produces a vertical stacked bar chart of counts '
                              'grouped by two nominal fields. Design: Stacked bars show part-to-whole composition '
                              'within each category. Vertical layout for small category counts (<=4). Color encodes '
                              'the secondary grouping field from the related entity. Color is preferably mapped to the '
                              'variable with fewer unique values for better discriminability. Tasks: Compare group '
                              'compositions across categories; identify dominant sub-groups within each bar. Query '
                              'patterns: How many <E1> are there, grouped by <E1.F1:n> and <E2.F2:n>?',
               'name': 'vis_004_stacked_bar_join_count_vert_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'nominal field, encodes x-axis.',
                                                               'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes color.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Joins two entities and produces a horizontal stacked bar chart of counts '
                              'grouped by two nominal fields. Design: Horizontal orientation for higher category '
                              'counts (>4). Color encodes the primary grouping field. Cross-entity join required. '
                              'Color is preferably mapped to the variable with fewer unique values for better '
                              'discriminability. Tasks: Compare group compositions across categories; identify '
                              'dominant sub-groups within each bar. Query patterns: How many <E1> are there, grouped '
                              'by <E1.F1:n> and <E2.F2:n>?',
               'name': 'vis_005_stacked_bar_join_count_horiz_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'nominal field, encodes color.',
                                                               'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes y-axis.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a vertical '
                              'stacked bar chart. Design: Vertical stacked layout for small category counts (<=4). '
                              'Color encodes the sub-group field; x-axis shows the primary grouping. Color is '
                              'preferably mapped to the variable with fewer unique values for better discriminability. '
                              'Tasks: Compare group compositions across categories; identify dominant sub-groups '
                              'within each bar. Query patterns: How many <E> are there, grouped by <F1:n> and <F2:n>?',
               'name': 'vis_006_stacked_bar_count_vert_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a horizontal '
                              'stacked bar chart. Design: Horizontal stacked layout for higher category counts (>4). '
                              'Color encodes the sub-group; stacking shows part-to-whole within each bar. Color is '
                              'preferably mapped to the variable with fewer unique values for better discriminability. '
                              'Tasks: Compare group compositions across categories; identify dominant sub-groups '
                              'within each bar. Query patterns: How many <E> are there, grouped by <F1:n> and <F2:n>?; '
                              'What is the count of <F1:n> for each <F2:n>?',
               'name': 'vis_007_stacked_bar_count_horiz_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a grouped '
                              '(side-by-side) vertical bar chart. Design: Uses xOffset for side-by-side grouping, '
                              'allowing direct comparison between sub-groups. Suitable for small category counts '
                              '(<=4). Tasks: Directly compare sub-group counts within and across categories. Query '
                              'patterns: What is the count of <F1:n> for each <F2:n>?',
               'name': 'vis_008_stacked_bar_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes x-axis sub-group, '
                                                                       'color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a grouped '
                              '(side-by-side) horizontal bar chart. Design: Uses yOffset for side-by-side grouping in '
                              'horizontal orientation. Chosen when at least one field has more than 4 categories. '
                              'Tasks: Directly compare sub-group counts within and across categories. Query patterns: '
                              'What is the count of <F1:n> for each <F2:n>?',
               'name': 'vis_009_stacked_bar_count_horiz_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes y-axis sub-group, '
                                                                       'color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Shows the relative frequency (proportion) of one nominal field within '
                              'each category of another, as a vertical normalized bar chart. Design: Normalization '
                              'computes proportions per group, enabling fair comparison across groups of different '
                              'sizes. Vertical layout for small category counts (<=4). Color is preferably mapped to '
                              'the variable with fewer unique values for better discriminability. Tasks: Compare '
                              'relative proportions across categories; identify which sub-groups dominate in each '
                              'group. Query patterns: What is the proportion of <F1:n> for each <F2:n>?',
               'name': 'vis_010_stacked_bar_freq_vert_normalized',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Shows the relative frequency (proportion) of one nominal field within '
                              'each category of another, as a horizontal normalized bar chart. Design: Normalization '
                              'for proportional comparison. Horizontal layout for higher category counts (>4). Color '
                              'is preferably mapped to the variable with fewer unique values for better '
                              'discriminability. Tasks: Compare relative proportions across categories; identify which '
                              'sub-groups dominate in each group. Query patterns: What is the proportion of <F1:n> for '
                              'each <F2:n>?',
               'name': 'vis_011_stacked_bar_freq_horiz_normalized',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the minimum of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the minimum aggregate value for easy comparison. Tasks: Compare the '
                              'minimum value across categories; identify which group has the highest or lowest '
                              'minimum. Query patterns: What is the minimum <F1:q> for each <F2:n>?',
               'name': 'vis_012_barchart_min_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the minimum of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the minimum aggregate value. Tasks: Compare the minimum value across '
                              'categories; identify which group has the highest or lowest minimum. Query patterns: '
                              'What is the minimum <F1:q> for each <F2:n>?',
               'name': 'vis_013_barchart_min_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the maximum of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the maximum aggregate value for easy comparison. Tasks: Compare the '
                              'maximum value across categories; identify which group has the highest or lowest '
                              'maximum. Query patterns: What is the maximum <F1:q> for each <F2:n>?',
               'name': 'vis_014_barchart_max_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the maximum of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the maximum aggregate value. Tasks: Compare the maximum value across '
                              'categories; identify which group has the highest or lowest maximum. Query patterns: '
                              'What is the maximum <F1:q> for each <F2:n>?',
               'name': 'vis_015_barchart_max_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the average of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the average aggregate value for easy comparison. Tasks: Compare the '
                              'average value across categories; identify which group has the highest or lowest '
                              'average. Query patterns: What is the average <F1:q> for each <F2:n>?',
               'name': 'vis_016_barchart_avg_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the average of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the average aggregate value. Tasks: Compare the average value across '
                              'categories; identify which group has the highest or lowest average. Query patterns: '
                              'What is the average <F1:q> for each <F2:n>?',
               'name': 'vis_017_barchart_avg_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the median of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the median aggregate value for easy comparison. Tasks: Compare the '
                              'median value across categories; identify which group has the highest or lowest median. '
                              'Query patterns: What is the median <F1:q> for each <F2:n>?',
               'name': 'vis_018_barchart_median_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the median of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the median aggregate value. Tasks: Compare the median value across categories; '
                              'identify which group has the highest or lowest median. Query patterns: What is the '
                              'median <F1:q> for each <F2:n>?',
               'name': 'vis_019_barchart_median_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the total of a quantitative field for each category, displayed as a '
                              'horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the total aggregate value for easy comparison. Tasks: Compare the total '
                              'value across categories; identify which group has the highest or lowest total. Query '
                              'patterns: What is the total <F1:q> for each <F2:n>?',
               'name': 'vis_020_barchart_sum_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the total of a quantitative field for each category, displayed as a '
                              'vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the total aggregate value. Tasks: Compare the total value across categories; '
                              'identify which group has the highest or lowest total. Query patterns: What is the total '
                              '<F1:q> for each <F2:n>?',
               'name': 'vis_021_barchart_sum_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[scatterplot] Plots two quantitative fields as a scatterplot to explore their '
                              'relationship. Design: Point marks on two quantitative axes reveal correlations, '
                              'clusters, and outliers. Data size capped at 100k rows for rendering performance. Tasks: '
                              'Assess correlation between two variables; identify clusters, outliers, extremes, and '
                              'the range of both variables. Query patterns: Is there a correlation between <F1:q> and '
                              '<F2:q>?; Make a scatterplot of <F1:q> and <F2:q>?',
               'name': 'vis_022_scatterplot_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Creates a vertical stacked bar chart of counts grouped by two nominal '
                              'fields. Design: Vertical stacked layout for small primary category counts (<=4). Color '
                              'encodes the secondary field. Color is preferably mapped to the variable with fewer '
                              'unique values for better discriminability. Tasks: Compare group compositions across '
                              'categories; assess the overall range of counts. Query patterns: Make a stacked bar '
                              'chart of <F1:n> and <F2:n>?',
               'name': 'vis_023_stacked_bar_count_vert_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Creates a horizontal stacked bar chart of counts grouped by two nominal '
                              'fields. Design: Horizontal stacked layout for higher primary category counts (>4). '
                              'Color encodes the secondary field. Color is preferably mapped to the variable with '
                              'fewer unique values for better discriminability. Tasks: Compare group compositions '
                              'across categories; assess the overall range of counts. Query patterns: Make a stacked '
                              'bar chart of <F1:n> and <F2:n>?',
               'name': 'vis_024_stacked_bar_count_horiz_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[circular] Creates a pie chart showing the proportional distribution of a nominal '
                              'field. Design: Arc marks with theta encoding map proportion to angle. Suitable for '
                              'fields with few categories (<8) where part-to-whole perception is the goal. Tasks: '
                              'Assess part-to-whole proportions; identify the dominant category. Query patterns: Make '
                              'a pie chart of <F:n>?',
               'name': 'vis_025_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[circular] Creates a donut chart showing the proportional distribution of a nominal '
                              'field. Design: Donut variant with inner/outer radius creates a hollow center that can '
                              'improve label readability. Suitable for few categories (<8). Tasks: Assess '
                              'part-to-whole proportions; identify the dominant category. Query patterns: Make a donut '
                              'chart of <F:n>?',
               'name': 'vis_026_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Counts the total number of records in an entity and displays the result as a '
                              'single-row table. Design: Simple rollup with no visual encoding beyond the count value. '
                              'Useful as a quick data quality or size check. Tasks: Retrieve the total record count '
                              'for an entity. Query patterns: How many <E> records are there?',
               'name': 'vis_027_table_count',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Displays the raw data for an entity as a table. Design: No aggregation or '
                              'transformation applied; shows the underlying data as-is for exploration. Tasks: Explore '
                              'raw data; retrieve specific values; understand field values and ranges; identify '
                              'anomalies and extremes. Query patterns: What does the <E> data look like?; Make a table '
                              'of <E>?',
               'name': 'vis_028_table_raw',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Joins two related entities and displays the combined data as a table. Design: '
                              'Cross-entity join enriches the view by combining fields from two related entities. '
                              'Requires a valid foreign-key relationship. Tasks: Explore combined data from two '
                              'related entities; retrieve specific values; identify anomalies and extremes. Query '
                              'patterns: What does the combined data of <E1> and <E2> look like?; Make a table that '
                              'combines <E1> and <E2>.',
               'name': 'vis_029_table_join',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds which related entity record has the highest count of associated records, '
                              'displayed as a ranked table with bar indicators. Design: Groups by foreign key, counts, '
                              'ranks, and highlights the top record with color encoding. Bar marks on the count column '
                              'provide visual comparison. Tasks: Identify the record with the most associated '
                              'entities; compare counts across records. Query patterns: What <E2> has the most <E1>?',
               'name': 'vis_030_table_join_count_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds the record with the largest value in a quantitative field, displayed as a '
                              'ranked table with bar indicators. Design: Sorts descending by the target field, derives '
                              'a rank, and highlights the top record with color. Bar marks provide visual magnitude '
                              'comparison. Tasks: Identify the record with the largest value; compare values across '
                              'records. Query patterns: What Record in <E> has the largest <F:q>?',
               'name': 'vis_031_table_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Joins two entities, computes the maximum of a quantitative field per group, and '
                              'ranks the results in a table with bar indicators. Design: Cross-entity join followed by '
                              'group-level max aggregation. Highlights the top record with color encoding. Tasks: '
                              'Identify which related record has the largest aggregated value; compare across groups. '
                              'Query patterns: What Record in <E2> has the largest <E1> <E1.F:q>?',
               'name': 'vis_032_table_join_max_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'any type field.', 'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds the record with the smallest value in a quantitative field, displayed as '
                              'a ranked table with conditional formatting. Design: Sorts ascending by the target '
                              'field, derives a rank, and highlights the top record with background color. Uses rect '
                              'mark for row-level highlighting. Tasks: Identify the record with the smallest value; '
                              'compare values across records. Query patterns: What Record in <E> has the smallest '
                              '<F:q>?',
               'name': 'vis_033_table_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Joins two entities, computes the minimum of a quantitative field per group, and '
                              'ranks the results in a table with conditional formatting. Design: Cross-entity join '
                              'followed by group-level min aggregation. Highlights the top record with background '
                              'color via rect mark. Tasks: Identify which related record has the smallest aggregated '
                              'value; compare across groups. Query patterns: What Record in <E2> has the smallest <E1> '
                              '<E1.F:q>?',
               'name': 'vis_034_table_join_min_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'any type field.', 'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Sorts entity records by a quantitative field and displays the result as an '
                              'ordered table with in-cell bar marks. Design: Ordered by the quantitative field with '
                              'nulls filtered out. In-cell bar marks provide visual comparison of magnitude alongside '
                              'the text values. Tasks: View records in sorted order; compare relative magnitudes. '
                              'Query patterns: Order the <E> by <F:q>?',
               'name': 'vis_035_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Computes the minimum and maximum of a quantitative field and displays them as a '
                              'single-row table. Design: Simple rollup of min and max. Filters out nulls before '
                              'aggregation for accuracy. Tasks: Determine the range of a quantitative field. Query '
                              'patterns: What is the range of <E> <F:q> values?',
               'name': 'vis_036_table_min',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Lists all distinct values of a nominal field with their counts, displayed as a '
                              'table with in-cell bar marks. Design: Groups by the nominal field and counts '
                              'occurrences. In-cell bars provide visual frequency comparison. Tasks: Determine the '
                              'range (distinct values) of a nominal field; compare category frequencies. Query '
                              'patterns: What is the range of <E> <F:n> values?',
               'name': 'vis_037_table_count_distinct',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Computes the min and max of a quantitative field for each category of a nominal '
                              'field, displayed as a table with range bar marks. Design: Groups by nominal field, '
                              'computes min/max and derived range, then orders by range descending. Uses x/x2 encoding '
                              'to show the span between min and max values. Tasks: Compare the spread of a '
                              'quantitative field across categories; identify which group has the widest or narrowest '
                              'range. Query patterns: What is the range of <E> <F1:q> values for every <F2:n>?',
               'name': 'vis_038_table_range',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes text label.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds the most frequent value of a nominal field, displayed as a ranked table '
                              'with bar marks and conditional formatting. Design: Groups by nominal field, counts, '
                              'ranks, and highlights the top value. Combines bar marks for count comparison and '
                              'background color for emphasis. Tasks: Identify the most frequent category; compare '
                              'frequencies across all categories. Query patterns: What is the most frequent <F:n>?',
               'name': 'vis_039_table_ranked_mode',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[line] Shows the cumulative distribution function (CDF) of a quantitative field as a '
                              'line chart. Design: Sorts by value, computes rolling percentile, and draws a line. The '
                              'CDF reveals the full distribution shape including median, quartiles, and tails. Tasks: '
                              'Characterize the distribution of a variable; identify median, quartiles, and '
                              'concentration of values. Query patterns: What is the cumulative distribution of <F:q>?; '
                              'Make a CDF plot of <F:q>.',
               'name': 'vis_040_line_cdf',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[grouped_line] Shows the cumulative distribution of a quantitative field for each '
                              'category of a nominal field, with separate lines per group. Design: Groups by nominal '
                              'field before computing per-group CDF. Color encodes group identity. Limited to fewer '
                              'than 5 groups for readability. Tasks: Compare distributions across groups; identify '
                              'which groups have higher or lower concentrations of values. Query patterns: What is the '
                              'cumulative distribution of <F1:q> for each <F2:n>?; Make a CDF plot of <F1:q> with a '
                              'line for each <F2:n>.',
               'name': 'vis_041_grouped_line_cdf',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[heatmap] Displays the count of entities for each combination of two nominal fields as '
                              'a heatmap with labeled cells. Design: Rect marks with quantitative color encoding show '
                              'density. Overlaid text marks display exact counts. Text color adapts based on cell '
                              'intensity for readability. The field with more unique values is preferably placed on '
                              'the y-axis, where longer labels remain readable. Tasks: Identify clusters or patterns '
                              'in the co-occurrence of two fields; compare counts across combinations; find '
                              'correlations. Query patterns: Are there any clusters with respect to <E> counts of '
                              '<F1:n> and <F2:n>?; Make a heatmap of <E> <F1:n> and <F2:n>.',
               'name': 'vis_042_heatmap_count',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[heatmap] Displays the average of a quantitative field for each combination of two '
                              'nominal fields as a heatmap. Design: Uses three fields: a quantitative measure '
                              'aggregated by average, and two nominal axes. Color encodes the aggregate value. The '
                              'field with more unique values is preferably placed on the y-axis for better label '
                              'readability. Tasks: Identify patterns in the average value across two categorical '
                              'dimensions; find combinations with extreme values. Query patterns: What is the average '
                              '<F1:q> for each <F2:n> and <F3:n>?',
               'name': 'vis_043_heatmap_avg',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field3': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[grouped_scatter] Plots two quantitative fields as a scatterplot with points colored by '
                              'a nominal field to reveal group-level clusters. Design: Adds color encoding to a '
                              'standard scatterplot to separate groups visually. Limited to fewer than 8 color '
                              'categories for perceptual clarity. Tasks: Identify clusters that separate by group; '
                              'assess whether the relationship between two quantitative fields differs across groups. '
                              'Query patterns: Are there clusters of <E> <F1:q> and <F2:q> values across different '
                              '<F3:n> groups?',
               'name': 'vis_044_grouped_scatter_by_color',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field3': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[histogram] Shows the distribution of a quantitative field as a histogram with '
                              'automatically computed bins. Design: Uses binby to create equal-width bins. Rect marks '
                              'span from bin start to bin end on x, with count on y. Tasks: Characterize the shape of '
                              'a distribution; identify modes, skewness, and gaps. Query patterns: What is the '
                              'distribution of <F:q>?; Make a histogram of <F:q>?',
               'name': 'vis_045_histogram_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[area] Shows the distribution of a quantitative field as a smooth density curve (KDE) '
                              'rendered as an area chart. Design: Kernel density estimation produces a smooth curve. '
                              'Area mark fills below the density line. Used for moderate cardinality (50-250) where a '
                              'smooth estimate is more informative than binning. Tasks: Characterize the shape of a '
                              'distribution; identify modes and overall density patterns. Query patterns: What is the '
                              'distribution of <F:q>?',
               'name': 'vis_046_area_density',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[dot] Shows the distribution of a quantitative field as individual points along a '
                              'single axis. Design: Point marks on a single quantitative x-axis. Best for small '
                              'datasets (50 or fewer values) where individual observations are meaningful and '
                              'overplotting is minimal. Tasks: Characterize the distribution; identify individual '
                              'values, clusters, and outliers. Query patterns: What is the distribution of <F:q>?',
               'name': 'vis_047_dot_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[grouped_area] Compares the distribution of a quantitative field across categories '
                              'using overlapping density curves (KDE) with area and line marks. Design: Per-group KDE '
                              'with semi-transparent area fills and line outlines. Color encodes group identity. '
                              'Limited to fewer than 4 groups to avoid excessive overlap. Opacity set to 0.25 for '
                              'layering. Tasks: Compare distribution shapes across groups; identify shifts in central '
                              'tendency or spread. Query patterns: Is the distribution of <F1:q> similar for each '
                              '<F2:n>?',
               'name': 'vis_048_grouped_area_density',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[grouped_dot] Compares the distribution of a quantitative field across categories using '
                              'dot strips, with one row per category. Design: Points plotted on a quantitative x-axis '
                              'with nominal y-axis for group separation. Color reinforces group identity. Best for '
                              'small datasets (50 or fewer values per group). Tasks: Compare distributions across '
                              'groups; identify clusters and outliers within each group. Query patterns: Is the '
                              'distribution of <F1:q> similar for each <F2:n>?',
               'name': 'vis_049_grouped_dot_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis, color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Analyzes data completeness by counting and computing the percentage of records '
                              'with non-null values in a specified field. Design: Derives total count before '
                              'filtering, then computes valid count and percentage. Percentage bar with 50% reference '
                              'line provides visual context for data completeness. Tasks: Assess data completeness for '
                              'a field; determine how many records have valid values and what proportion. Query '
                              'patterns: How many <E> records have a non-null <F:q|o|n>?; What percentage of <E> '
                              'records have a non-null <F:q|o|n>?',
               'name': 'vis_050_table_count_null_nonnull',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Analyzes data quality by counting and computing the percentage of records with '
                              'null values in a specified field. Design: Derives null count as total minus valid '
                              'count. Percentage bar shows the null proportion with a 50% reference line. Tasks: '
                              'Assess data quality; determine how many records are missing a value and what '
                              'proportion. Query patterns: How many <E> records have a null <F:q|o|n>?; What '
                              'percentage of <E> records have a null <F:q|o|n>?',
               'name': 'vis_051_table_count_null',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'}]


# Dispatch: tool name -> (template_index, param_to_binding_map)
TOOL_DISPATCH = {'vis_000_barchart_count_vert_grouped': (0, {'entity': 'E', 'field': 'F'}),
 'vis_001_barchart_count_horiz_grouped': (1, {'entity': 'E', 'field': 'F'}),
 'vis_002_barchart_join_count_vert_grouped': (2, {'entity1': 'E1', 'entity2': 'E2', 'entity2_field': 'E2.F'}),
 'vis_003_barchart_join_count_horiz_grouped': (3, {'entity1': 'E1', 'entity2': 'E2', 'entity2_field': 'E2.F'}),
 'vis_004_stacked_bar_join_count_vert_stacked_grouped': (4,
                                                         {'entity1': 'E1',
                                                          'entity1_field': 'E1.F1',
                                                          'entity2': 'E2',
                                                          'entity2_field': 'E2.F2'}),
 'vis_005_stacked_bar_join_count_horiz_stacked_grouped': (5,
                                                          {'entity1': 'E1',
                                                           'entity1_field': 'E1.F1',
                                                           'entity2': 'E2',
                                                           'entity2_field': 'E2.F2'}),
 'vis_006_stacked_bar_count_vert_stacked_grouped': (6, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_007_stacked_bar_count_horiz_stacked_grouped': (7, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_008_stacked_bar_count_vert_grouped': (8, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_009_stacked_bar_count_horiz_grouped': (9, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_010_stacked_bar_freq_vert_normalized': (10, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_011_stacked_bar_freq_horiz_normalized': (11, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_012_barchart_min_horiz': (12, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_013_barchart_min_vert': (13, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_014_barchart_max_horiz': (14, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_015_barchart_max_vert': (15, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_016_barchart_avg_horiz': (16, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_017_barchart_avg_vert': (17, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_018_barchart_median_horiz': (18, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_019_barchart_median_vert': (19, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_020_barchart_sum_horiz': (20, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_021_barchart_sum_vert': (21, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_022_scatterplot_basic': (22, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_023_stacked_bar_count_vert_stacked_grouped': (23, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_024_stacked_bar_count_horiz_stacked_grouped': (24, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_025_circular_proportion_distribution': (25, {'entity': 'E', 'field': 'F'}),
 'vis_026_circular_proportion_distribution': (26, {'entity': 'E', 'field': 'F'}),
 'vis_027_table_count': (27, {'entity': 'E'}),
 'vis_028_table_raw': (28, {'entity': 'E'}),
 'vis_029_table_join': (29, {'entity1': 'E1', 'entity2': 'E2'}),
 'vis_030_table_join_count_ranked': (30, {'entity1': 'E1', 'entity2': 'E2'}),
 'vis_031_table_ranked': (31, {'entity': 'E', 'field': 'F'}),
 'vis_032_table_join_max_ranked': (32, {'entity1': 'E1', 'entity1_field': 'E1.F', 'entity2': 'E2'}),
 'vis_033_table_ranked': (33, {'entity': 'E', 'field': 'F'}),
 'vis_034_table_join_min_ranked': (34, {'entity1': 'E1', 'entity1_field': 'E1.F', 'entity2': 'E2'}),
 'vis_035_table_sorted': (35, {'entity': 'E', 'field': 'F'}),
 'vis_036_table_min': (36, {'entity': 'E', 'field': 'F'}),
 'vis_037_table_count_distinct': (37, {'entity': 'E', 'field': 'F'}),
 'vis_038_table_range': (38, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_039_table_ranked_mode': (39, {'entity': 'E', 'field': 'F'}),
 'vis_040_line_cdf': (40, {'entity': 'E', 'field': 'F'}),
 'vis_041_grouped_line_cdf': (41, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_042_heatmap_count': (42, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_043_heatmap_avg': (43, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_044_grouped_scatter_by_color': (44, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_045_histogram_distribution': (45, {'entity': 'E', 'field': 'F'}),
 'vis_046_area_density': (46, {'entity': 'E', 'field': 'F'}),
 'vis_047_dot_distribution': (47, {'entity': 'E', 'field': 'F'}),
 'vis_048_grouped_area_density': (48, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_049_grouped_dot_distribution': (49, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_050_table_count_null_nonnull': (50, {'entity': 'E', 'field': 'F'}),
 'vis_051_table_count_null': (51, {'entity': 'E', 'field': 'F'})}
